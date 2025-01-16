import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { XnomadLaunch } from "../target/types/xnomad_launch";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";
import { getMerkleProof, getMerkleRoot } from "@metaplex-foundation/mpl-core-candy-machine";

describe("xnomad-launch", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.XnomadLaunch as Program<XnomadLaunch>;
  const recipient = Keypair.generate();
  let vault = Keypair.generate();

  // Vault configuration
  const MAX_MINT_AMOUNT = 3;
  const WHITELIST_MAX_MINT_AMOUNT = 5;
  const UNIT_PRICE = 0.5 * LAMPORTS_PER_SOL;
  const now = Math.floor(Date.now() / 1000);
  const START_TIME = now - 60;
  const END_TIME = now + 3600;

  const userNoWL = Keypair.generate();
  const userWL0 = Keypair.generate();
  const userWL1 = Keypair.generate();

  const whitelist = [
    userWL0.publicKey,
    userWL1.publicKey,
  ]
  const MERKLE_ROOT = getMerkleRoot(whitelist.map(k => k.toBuffer()));

  before(async () => {
    await Promise.all([
      provider.connection.requestAirdrop(userNoWL.publicKey, 100 * LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(userWL0.publicKey, 100 * LAMPORTS_PER_SOL),
      provider.connection.requestAirdrop(userWL1.publicKey, 100 * LAMPORTS_PER_SOL),
    ])
  })
  
  beforeEach(async () => {
    vault = Keypair.generate();
    await program.methods
      .initializeVault(
        recipient.publicKey,
        MAX_MINT_AMOUNT,
        WHITELIST_MAX_MINT_AMOUNT,
        new anchor.BN(UNIT_PRICE),
        new anchor.BN(START_TIME),
        new anchor.BN(END_TIME),
        Array.from(MERKLE_ROOT),
      )
      .accounts({
        vault: vault.publicKey,
        payer: provider.wallet.publicKey,
      })
      .signers([vault])
      .rpc();
  })

  const getUserDepositPda = (user: PublicKey, vault: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("user_deposit"), user.toBuffer(), vault.toBuffer()],
      program.programId
    )[0];
  }

  // it('verify_merkle_proof', async() => {
  //   // Create a list of addresses
  //   const keypairs = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];
  //   const addresses = keypairs.map(k => k.publicKey);

  //   // Get merkle root and proof for an address
  //   // const addressStrings = addresses.map(addr => addr.toBase58());
  //   const addressBuffers = addresses.map(addr => addr.toBuffer());
  //   const root = getMerkleRoot(addressBuffers);
  //   const proof = getMerkleProof(addressBuffers, addresses[2].toBuffer());

  //   const result = await program.methods
  //     .verifyMerkleProof(
  //       Array.from(root),
  //       proof.map(p => Array.from(p)),
  //       addresses[2] // Pass the public key directly
  //     )
  //     .accounts({
  //       payer: provider.wallet.publicKey,
  //     })
  //     .rpc();
    
  //   console.log('Merkle proof verification result:', result);

  //   // // Test with invalid address
  //   // try {
  //   //   await program.methods
  //   //     .verifyMerkleProof(
  //   //       Array.from(root),
  //   //       proof.map(p => Array.from(p)),
  //   //       addresses[1] // Wrong address
  //   //     )
  //   //     .accounts({
  //   //       payer: provider.wallet.publicKey,
  //   //     })
  //   //     .rpc();
  //   //   assert.fail("Should have failed with invalid merkle proof");
  //   // } catch (error) {
  //   //   assert.ok(error instanceof anchor.AnchorError);
  //   //   expect(error.error.errorCode.code === "InvalidMerkleProof");
  //   // }
  // });

  describe("initialize_vault", () => {
    it("Successfully initializes vault", async () => {
      vault = Keypair.generate();
      await program.methods
        .initializeVault(
          recipient.publicKey,
          MAX_MINT_AMOUNT,
          WHITELIST_MAX_MINT_AMOUNT,
          new anchor.BN(UNIT_PRICE),
          new anchor.BN(START_TIME),
          new anchor.BN(END_TIME),
          Array.from(MERKLE_ROOT),
        )
        .accounts({
          vault: vault.publicKey,
          payer: provider.wallet.publicKey,
        })
        .signers([vault])
        .rpc();

      const vaultAccount = await program.account.vault.fetch(vault.publicKey);
      expect(vaultAccount.totalDeposited.toString()).to.equal("0");
      expect(vaultAccount.totalNfts.toString()).to.equal("0");
      expect(vaultAccount.recipient.toString()).to.equal(recipient.publicKey.toString());
      expect(vaultAccount.maxMintAmount).to.equal(MAX_MINT_AMOUNT);
      expect(vaultAccount.whitelistMaxMintAmount).to.equal(WHITELIST_MAX_MINT_AMOUNT);
      expect(vaultAccount.unitPrice.toString()).to.equal(UNIT_PRICE.toString());
      expect(vaultAccount.startTime.toString()).to.equal(START_TIME.toString());
      expect(vaultAccount.endTime.toString()).to.equal(END_TIME.toString());
      expect(Buffer.from(vaultAccount.merkleRoot)).to.deep.equal(MERKLE_ROOT);
    });
  });

  describe("deposit", () => {
    it("Successfully deposits multiple times with no whitelist", async () => {
      const user = userNoWL.publicKey;
      const firstNftAmount = 2;
      const secondNftAmount = 1;

      const checkUserDeposit = async (nftAmount: number, depositAmount: number) => {
        // Calculate user deposit PDA
        const userDepositPda = getUserDepositPda(user, vault.publicKey);
        const userDeposit = await program.account.userDeposit.fetch(userDepositPda);
        expect(userDeposit.user.toString()).to.equal(user.toString());
        expect(userDeposit.nftAmount).to.equal(nftAmount);
        expect(userDeposit.depositAmount.toString()).to.equal((depositAmount).toString());
        expect(userDeposit.vault.toString()).to.equal(vault.publicKey.toString());
      }

      const checkVault = async (totalNfts: number, totalDeposited: number) => {
        const vaultAccount = await program.account.vault.fetch(vault.publicKey);
        expect(vaultAccount.totalDeposited.toString()).to.equal(totalDeposited.toString());
        expect(vaultAccount.totalNfts.toString()).to.equal(totalNfts.toString());
      }

      const initialBalance = await provider.connection.getBalance(recipient.publicKey);

      // First deposit
      await program.methods.deposit(firstNftAmount, null)
        .accounts({
          user,
          recipient: recipient.publicKey,
          vault: vault.publicKey,
        })
        .signers([userNoWL])
        .rpc();

      await checkUserDeposit(firstNftAmount, firstNftAmount * UNIT_PRICE);
      await checkVault(firstNftAmount, firstNftAmount * UNIT_PRICE);

      let midBalance = await provider.connection.getBalance(recipient.publicKey);
      expect(midBalance - initialBalance).to.equal(firstNftAmount * UNIT_PRICE);

      // Second 
      await program.methods.deposit(secondNftAmount, null)
        .accounts({
          user,
          recipient: recipient.publicKey,
          vault: vault.publicKey,
        })
        .signers([userNoWL])
        .rpc();

      await checkUserDeposit(firstNftAmount + secondNftAmount, (firstNftAmount + secondNftAmount) * UNIT_PRICE);
      await checkVault(firstNftAmount + secondNftAmount, (firstNftAmount + secondNftAmount) * UNIT_PRICE);

      const finalBalance = await provider.connection.getBalance(recipient.publicKey);
      expect(finalBalance - initialBalance).to.equal((firstNftAmount + secondNftAmount) * UNIT_PRICE);
    });

    it("Successfully deposits with whitelist proof", async () => {
      const merkleProof = getMerkleProof(whitelist.map(k => k.toBuffer()), userWL0.publicKey.toBuffer());

      // Deposit with whitelist proof
      const nftAmount = 3;
      await program.methods
        .deposit(
          nftAmount,
          merkleProof.map(p => Array.from(p)),
        )
        .accounts({
          user: userWL0.publicKey,
          recipient: recipient.publicKey,
          vault: vault.publicKey,
        })
        .signers([userWL0])
        .rpc();

      // Verify deposit
      const userDepositPda = getUserDepositPda(userWL0.publicKey, vault.publicKey);
      const userDeposit = await program.account.userDeposit.fetch(userDepositPda);
      expect(userDeposit.nftAmount).to.equal(nftAmount);
    });

    it("Fails with invalid mint amount", async () => {
      const invalidAmount = MAX_MINT_AMOUNT + 1;

      try {
        await program.methods
          .deposit(invalidAmount, null)
          .accounts({
            user: userNoWL.publicKey,
            recipient: recipient.publicKey,
            vault: vault.publicKey,
          })
          .signers([userNoWL])
          .rpc();
        expect.fail("Should have failed with exceeds mint limit");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === 'ExceedsMintLimit')
      }
    });

    it('Fails with invalid whitelist mint amount', async () => {
      const nftAmount = WHITELIST_MAX_MINT_AMOUNT + 1;
      const merkleProof = getMerkleProof(whitelist.map(k => k.toBuffer()), userWL0.publicKey.toBuffer());
      try {
        await program.methods
        .deposit(nftAmount, merkleProof.map(p => Array.from(p)))
        .accounts({
          user: userWL0.publicKey,
          recipient: recipient.publicKey,
          vault: vault.publicKey,
        })
        .signers([userWL0])
        .rpc();
        expect.fail('Should have failed with invalid whitelist mint amount');
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === 'ExceedsWhitelistLimit')
      }
    })

    it("Fails when deposit before start time", async () => {
      const futureVault = Keypair.generate();
      const futureStart = now + 3600; // 1 hour later
      const futureEnd = now + 7200; // 2 hours later

      // Initialize a vault that hasn't started yet
      await program.methods
        .initializeVault(
          recipient.publicKey,
          MAX_MINT_AMOUNT,
          WHITELIST_MAX_MINT_AMOUNT,
          new anchor.BN(UNIT_PRICE),
          new anchor.BN(futureStart),
          new anchor.BN(futureEnd),
          Array.from(MERKLE_ROOT),
        )
        .accounts({
          vault: futureVault.publicKey,
          payer: provider.wallet.publicKey,
        })
        .signers([futureVault])
        .rpc();

      try {
        await program.methods
          .deposit(1, null)
          .accounts({
            user: provider.wallet.publicKey,
            recipient: recipient.publicKey,
            vault: futureVault.publicKey,
          })
          .rpc();
        expect.fail("Should have failed with NotStarted error");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "NotStarted");
      }
    });

    it("Fails when deposit after end time", async () => {
      const expiredVault = Keypair.generate();
      const pastStart = now - 7200; // 2 hours ago
      const pastEnd = now - 3600; // 1 hour ago

      // Initialize a vault that has ended
      await program.methods
        .initializeVault(
          recipient.publicKey,
          MAX_MINT_AMOUNT,
          WHITELIST_MAX_MINT_AMOUNT,
          new anchor.BN(UNIT_PRICE),
          new anchor.BN(pastStart),
          new anchor.BN(pastEnd),
          Array.from(MERKLE_ROOT),
        )
        .accounts({
          vault: expiredVault.publicKey,
          payer: provider.wallet.publicKey,
        })
        .signers([expiredVault])
        .rpc();

      try {
        await program.methods
          .deposit(1, null)
          .accounts({
            user: provider.wallet.publicKey,
            recipient: recipient.publicKey,
            vault: expiredVault.publicKey,
          })
          .rpc();
        expect.fail("Should have failed with Ended error");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "Ended");
      }
    });
    //   // ... similar setup as above ...
    //   const exceedAmount = WHITELIST_MAX_MINT_AMOUNT + 1;

    //   try {
    //     await program.methods
    //       .deposit(exceedAmount, merkleProof.map(p => Array.from(p)))
    //       .accounts({
    //         user: whitelistedUser.publicKey,
    //         recipient: recipient.publicKey,
    //         vault: whitelistVault.publicKey,
    //       })
    //       .signers([whitelistedUser])
    //       .rpc();
    //     expect.fail("Should have failed with ExceedsWhitelistLimit");
    //   } catch (error) {
    //     assert.ok(error instanceof anchor.AnchorError);
    //     expect(error.error.errorCode.code === "ExceedsWhitelistLimit");
    //   }
    // });

    // it("Fails with invalid merkle proof", async () => {
    //   // ... similar setup ...
    //   const invalidProof = merkleProof.map(p => Buffer.alloc(32, 0));

    //   try {
    //     await program.methods
    //       .deposit(1, invalidProof.map(p => Array.from(p)))
    //       .accounts({
    //         user: whitelistedUser.publicKey,
    //         recipient: recipient.publicKey,
    //         vault: whitelistVault.publicKey,
    //       })
    //       .signers([whitelistedUser])
    //       .rpc();
    //     expect.fail("Should have failed with InvalidMerkleProof");
    //   } catch (error) {
    //     assert.ok(error instanceof anchor.AnchorError);
    //     expect(error.error.errorCode.code === "InvalidMerkleProof");
    //   }
    // });
  });

  describe("update_vault", () => {
    it("Successfully updates all configurations", async () => {
      const newRecipient = Keypair.generate();
      const newMaxAmount = 6;
      const newUnitPrice = 0.6 * LAMPORTS_PER_SOL;
      const newStartTime = now + 1800;
      const newEndTime = now + 5400;

      await program.methods
        .updateVault(
          newRecipient.publicKey,
          newMaxAmount,
          null,
          new anchor.BN(newUnitPrice),
          new anchor.BN(newStartTime),
          new anchor.BN(newEndTime),
          null,
        )
        .accounts({
          vault: vault.publicKey,
          owner: provider.wallet.publicKey,
        })
        .rpc();

      // Verify updated vault state
      const vaultAccount = await program.account.vault.fetch(vault.publicKey);
      expect(vaultAccount.recipient.toString()).to.equal(newRecipient.publicKey.toString());
      expect(vaultAccount.maxMintAmount).to.equal(newMaxAmount);
      expect(vaultAccount.unitPrice.toString()).to.equal(newUnitPrice.toString());
      expect(vaultAccount.startTime.toString()).to.equal(newStartTime.toString());
      expect(vaultAccount.endTime.toString()).to.equal(newEndTime.toString());
    });

    it("Fails with non-owner", async () => {
      const nonOwner = Keypair.generate();
      const newRecipient = Keypair.generate();

      // Airdrop some SOL to non-owner for transaction fee
      const signature = await provider.connection.requestAirdrop(
        nonOwner.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(signature);

      try {
        await program.methods
          .updateVault(
            newRecipient.publicKey,
            null,
            null,
            null,
            null,
            null,
            null,
          )
          .accounts({
            vault: vault.publicKey,
            owner: nonOwner.publicKey,
          })
          .signers([nonOwner])
          .rpc();
        expect.fail("Should have failed with unauthorized owner");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "UnauthorizedOwner");
      }
    });

    it("Successfully performs partial updates", async () => {
      const oldVaultState = await program.account.vault.fetch(vault.publicKey);
      const newRecipient = Keypair.generate();

      // Only update recipient
      await program.methods
        .updateVault(
          newRecipient.publicKey,
          null,
          null,
          null,
          null,
          null,
          null,
        )
        .accounts({
          vault: vault.publicKey,
          owner: provider.wallet.publicKey,
        })
        .rpc();

      // Verify only recipient was updated
      const updatedVault = await program.account.vault.fetch(vault.publicKey);
      expect(updatedVault.recipient.toString()).to.equal(newRecipient.publicKey.toString());
      expect(updatedVault.maxMintAmount).to.equal(oldVaultState.maxMintAmount);
      expect(updatedVault.unitPrice.toString()).to.equal(oldVaultState.unitPrice.toString());
      expect(updatedVault.startTime.toString()).to.equal(oldVaultState.startTime.toString());
      expect(updatedVault.endTime.toString()).to.equal(oldVaultState.endTime.toString());
    });
  });

  describe("queries", () => {
    it("Gets all deposits", async () => {
      const allUserDeposits = await program.account.userDeposit.all();
      console.log("All deposits:", allUserDeposits.map(deposit => ({
        user: deposit.account.user.toString(),
        nftAmount: deposit.account.nftAmount,
        depositAmount: deposit.account.depositAmount.toString(),
        vault: deposit.account.vault.toString()
      })));
    });

    it("Gets total stats", async () => {
      const vaultAccount = await program.account.vault.fetch(vault.publicKey);
      console.log("Total stats:", {
        totalDeposited: vaultAccount.totalDeposited.toString(),
        totalNfts: vaultAccount.totalNfts.toString(),
        recipient: vaultAccount.recipient.toString(),
        maxMintAmount: vaultAccount.maxMintAmount,
        unitPrice: vaultAccount.unitPrice.toString(),
        startTime: new Date(Number(vaultAccount.startTime) * 1000).toISOString(),
        endTime: new Date(Number(vaultAccount.endTime) * 1000).toISOString(),
      });
    });
  });
});
