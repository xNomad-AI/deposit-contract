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
  const MAX_UNIT_PRICE = 1 * LAMPORTS_PER_SOL;
  const MIN_UNIT_PRICE = 0.5 * LAMPORTS_PER_SOL;
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
        new anchor.BN(MAX_UNIT_PRICE),
        new anchor.BN(MIN_UNIT_PRICE),
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

  describe("initialize_vault", () => {
    it("Successfully initializes vault", async () => {
      vault = Keypair.generate();
      await program.methods
        .initializeVault(
          recipient.publicKey,
          MAX_MINT_AMOUNT,
          WHITELIST_MAX_MINT_AMOUNT,
          new anchor.BN(MAX_UNIT_PRICE),
          new anchor.BN(MIN_UNIT_PRICE),
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
      expect(vaultAccount.maxUnitPrice.toString()).to.equal(MAX_UNIT_PRICE.toString());
      expect(vaultAccount.minUnitPrice.toString()).to.equal(MIN_UNIT_PRICE.toString());
      expect(vaultAccount.startTime.toString()).to.equal(START_TIME.toString());
      expect(vaultAccount.endTime.toString()).to.equal(END_TIME.toString());
      expect(Buffer.from(vaultAccount.merkleRoot)).to.deep.equal(MERKLE_ROOT);
    });
  });

  const deposit = async (user: Keypair, nftAmount: number, unitPrice: number, merkleProof: Uint8Array[] | null, recipient: PublicKey, vault: PublicKey) => {
    return await program.methods.deposit(nftAmount, new anchor.BN(unitPrice), merkleProof ? merkleProof.map(p => Array.from(p)) : null)
      .accounts({
        user: user.publicKey,
        recipient,
        vault,
      })
      .signers([user])
      .rpc();
  }

  // Helper function to check user deposit records
  const checkUserDeposit = async (user: PublicKey, expectedDeposits: Array<{nftAmount: number, depositAmount: number}>) => {
    const userDepositPda = getUserDepositPda(user, vault.publicKey);
    const userDeposit = await program.account.userDeposit.fetch(userDepositPda);
    console.log('UserDeposit:', userDeposit);
    
    // Verify totals
    const totalNftAmount = expectedDeposits.reduce((sum, d) => sum + d.nftAmount, 0);
    const totalDepositAmount = expectedDeposits.reduce((sum, d) => sum + d.depositAmount, 0);
    
    expect(userDeposit.totalNftAmount).to.equal(totalNftAmount);
    expect(userDeposit.totalDepositAmount.toString()).to.equal(totalDepositAmount.toString());
    
    // Verify each deposit record
    expect(userDeposit.deposits.length).to.equal(expectedDeposits.length);
    for(let i = 0; i < expectedDeposits.length; i++) {
      expect(userDeposit.deposits[i].nftAmount).to.equal(expectedDeposits[i].nftAmount);
      expect(userDeposit.deposits[i].depositAmount.toString()).to.equal(
        (expectedDeposits[i].depositAmount).toString()
      );
      expect(userDeposit.deposits[i].timestamp.toNumber()).to.be.gt(0);
    }
  };
  
  // Helper function to check vault state
  const checkVault = async (totalNfts: number, totalDeposited: number) => {
    const vaultAccount = await program.account.vault.fetch(vault.publicKey);
    expect(vaultAccount.totalDeposited.toString()).to.equal(totalDeposited.toString());
    expect(vaultAccount.totalNfts.toString()).to.equal(totalNfts.toString());
  };

  describe("deposit", () => {

    it("Successfully deposits multiple times with no whitelist", async () => {
      const user = userNoWL.publicKey;
      const depositAmounts = [1, 2];
      const depositUnitPrices = [0.5 * LAMPORTS_PER_SOL, 1 * LAMPORTS_PER_SOL];

      const deposits: Array<{nftAmount: number, depositAmount: number}> = [];
      let recipientBalanceBefore = await provider.connection.getBalance(recipient.publicKey);

      // Perform multiple deposits
      for(let i = 0; i < depositAmounts.length; i++) {
        const nftAmount = depositAmounts[i];
        const unitPrice = depositUnitPrices[i];
        const depositAmount = nftAmount * unitPrice;

        await deposit(userNoWL, nftAmount, unitPrice, null, recipient.publicKey, vault.publicKey);
          
        deposits.push({nftAmount, depositAmount});
        await checkUserDeposit(user, deposits);
        await checkVault(
          deposits.reduce((sum, d) => sum + d.nftAmount, 0),
          deposits.reduce((sum, d) => sum + d.depositAmount, 0)
        );

        const recipientBalanceAfter = await provider.connection.getBalance(recipient.publicKey);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(depositAmount);
        recipientBalanceBefore = recipientBalanceAfter;
      }
    });

    it("Successfully deposits with whitelist proof", async () => {
      const user = userWL0.publicKey;
      const depositAmounts = [2, 1, 2];
      const depositUnitPrices = [0.5 * LAMPORTS_PER_SOL, 0.7 * LAMPORTS_PER_SOL, 0.8 * LAMPORTS_PER_SOL];
      const merkleProof = getMerkleProof(whitelist.map(k => k.toBuffer()), userWL0.publicKey.toBuffer());

      const deposits: Array<{nftAmount: number, depositAmount: number}> = [];

      // Perform multiple deposits
      for (let i = 0; i < depositAmounts.length; i++) {
        const nftAmount = depositAmounts[i];
        const unitPrice = depositUnitPrices[i];
        const depositAmount = nftAmount * unitPrice;

        await deposit(userWL0, nftAmount, unitPrice, merkleProof, recipient.publicKey, vault.publicKey);

        deposits.push({nftAmount, depositAmount});
        await checkUserDeposit(user, deposits);
        await checkVault(
          deposits.reduce((sum, d) => sum + d.nftAmount, 0),
          deposits.reduce((sum, d) => sum + d.depositAmount, 0)
        );
      }
    });

    it('Fails with 0 nft amount', async () => {
      try {
        await deposit(userNoWL, 0, MIN_UNIT_PRICE, null, recipient.publicKey, vault.publicKey);
        expect.fail("Should have failed with invalid nft amount");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === 'InvalidNftAmount');
      }
    });

    const expectDepoistFailed = async (user: Keypair, nftAmount: number, unitPrice: number, merkleProof: Uint8Array[] | null, recipient: PublicKey, vault: PublicKey) => {
      try {
        await deposit(user, nftAmount, unitPrice, merkleProof, recipient, vault);
        expect.fail("Should have failed with exceeds mint limit");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === 'ExceedsMintLimit')
      }
    }

    it("Fails with invalid mint amount", async () => {
      // Mint MAX_MINT_AMOUNT + 1, should fail
      await expectDepoistFailed(userNoWL, MAX_MINT_AMOUNT + 1, MIN_UNIT_PRICE, null, recipient.publicKey, vault.publicKey);

      // Mint MAX_MINT_AMOUNT then mint 1, should fail
      await deposit(userNoWL, MAX_MINT_AMOUNT, MIN_UNIT_PRICE, null, recipient.publicKey, vault.publicKey);
      await expectDepoistFailed(userNoWL, 1, MIN_UNIT_PRICE, null, recipient.publicKey, vault.publicKey);
    });

    it('Fails with invalid whitelist mint amount', async () => {
      const merkleProof = getMerkleProof(whitelist.map(k => k.toBuffer()), userWL0.publicKey.toBuffer());

      // Mint WHITELIST_MAX_MINT_AMOUNT + 1, should fail
      await expectDepoistFailed(userWL0, WHITELIST_MAX_MINT_AMOUNT + 1, MIN_UNIT_PRICE, merkleProof, recipient.publicKey, vault.publicKey);

      // Mint WHITELIST_MAX_MINT_AMOUNT then mint 1, should fail
      await deposit(userWL0, WHITELIST_MAX_MINT_AMOUNT, MIN_UNIT_PRICE, merkleProof, recipient.publicKey, vault.publicKey);
      await expectDepoistFailed(userWL0, 1, MIN_UNIT_PRICE, merkleProof, recipient.publicKey, vault.publicKey);
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
          new anchor.BN(MAX_UNIT_PRICE),
          new anchor.BN(MIN_UNIT_PRICE),
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
        await deposit(userNoWL, 1, MIN_UNIT_PRICE, null, recipient.publicKey, futureVault.publicKey);
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
          new anchor.BN(MAX_UNIT_PRICE),
          new anchor.BN(MIN_UNIT_PRICE),
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
        await deposit(userNoWL, 1, MIN_UNIT_PRICE, null, recipient.publicKey, expiredVault.publicKey);
        expect.fail("Should have failed with Ended error");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "Ended");
      }
    });
  });

  const incrementDeposit = async (user: Keypair, depositIndex: number, newUnitPrice: number, recipient: PublicKey, vault: PublicKey) => {
    return await program.methods.incrementDeposit(depositIndex, new anchor.BN(newUnitPrice))
      .accounts({
        user: user.publicKey,
        recipient,
        vault,
      })
      .signers([user])
      .rpc();
  }

  describe("increment_deposit", () => {
    it("Successfully increments deposit", async () => {
      const nftAmounts = [1, 2];
      const oldUnitPrices = [0.6 * LAMPORTS_PER_SOL, 0.7 * LAMPORTS_PER_SOL];
      const newUnitPrices = [0.65 * LAMPORTS_PER_SOL, 0.75 * LAMPORTS_PER_SOL];
      const expectedDeposits = [
        {nftAmount: nftAmounts[0], depositAmount: oldUnitPrices[0] * nftAmounts[0]},
        {nftAmount: nftAmounts[1], depositAmount: oldUnitPrices[1] * nftAmounts[1]},
      ]

      await deposit(userNoWL, 1, oldUnitPrices[0], null, recipient.publicKey, vault.publicKey);
      await deposit(userNoWL, 2, oldUnitPrices[1], null, recipient.publicKey, vault.publicKey);

      let recipientBalanceBefore = await provider.connection.getBalance(recipient.publicKey);

      for (let i = 0; i < nftAmounts.length; i++) {
        await incrementDeposit(userNoWL, i, newUnitPrices[i], recipient.publicKey, vault.publicKey);

        expectedDeposits[i].depositAmount = newUnitPrices[i] * nftAmounts[i];
        await checkUserDeposit(userNoWL.publicKey, expectedDeposits);
        await checkVault(3, expectedDeposits.reduce((sum, d) => sum + d.depositAmount, 0));

        let recipientBalanceAfter = await provider.connection.getBalance(recipient.publicKey);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal((newUnitPrices[i] - oldUnitPrices[i]) * nftAmounts[i]);
        recipientBalanceBefore = recipientBalanceAfter;
      }

      // await incrementDeposit(userNoWL, 0, newUnitPrices[0], recipient.publicKey, vault.publicKey);

      // expectedDeposits[0].depositAmount = newUnitPrices[0] * nftAmounts[0];
      // await checkUserDeposit(userNoWL.publicKey, expectedDeposits);
      // await checkVault(3, expectedDeposits.reduce((sum, d) => sum + d.depositAmount, 0));

      // let recipientBalanceAfter = await provider.connection.getBalance(recipient.publicKey);
      // expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(newUnitPrices[0] - oldUnitPrices[0]);
      // recipientBalanceBefore = recipientBalanceAfter;

      // await incrementDeposit(userNoWL, 1, newUnitPrices[1], recipient.publicKey, vault.publicKey);

      // expectedDeposits[1].depositAmount = newUnitPrices[1] * nftAmounts[1];
      // await checkUserDeposit(userNoWL.publicKey, expectedDeposits);
      // await checkVault(3, expectedDeposits.reduce((sum, d) => sum + d.depositAmount, 0));

      // recipientBalanceAfter = await provider.connection.getBalance(recipient.publicKey);
      // expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(newUnitPrices[1] - oldUnitPrices[1]);
      // recipientBalanceBefore = recipientBalanceAfter;
    });

    it('Fails with invalid deposit amount', async () => {
      const oldUnitPrice = 0.6 * LAMPORTS_PER_SOL;
      const newUnitPrice = 0.59 * LAMPORTS_PER_SOL;

      await deposit(userNoWL, 1, oldUnitPrice, null, recipient.publicKey, vault.publicKey);

      try {
        await incrementDeposit(userNoWL, 0, newUnitPrice, recipient.publicKey, vault.publicKey);
        expect.fail("Should have failed with invalid deposit amount");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "InvalidDepositAmount");
      }

      try {
        await incrementDeposit(userNoWL, 0, MAX_UNIT_PRICE + 1, recipient.publicKey, vault.publicKey);
        expect.fail("Should have failed with invalid deposit amount");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "InvalidUnitPrice");
      }
    })

    it('Fails with invalid deposit index', async () => {
      try {
        await incrementDeposit(userNoWL, 0, 0.5 * LAMPORTS_PER_SOL, recipient.publicKey, vault.publicKey);
        expect.fail("Should have failed with invalid deposit index");
      } catch (error) {
        assert.ok(error instanceof anchor.AnchorError);
        expect(error.error.errorCode.code === "InvalidDepositIndex");
      }
    })
  });

  describe("update_vault", () => {
    it("Successfully updates all configurations", async () => {
      const newRecipient = Keypair.generate();
      const newMaxAmount = 6;
      const newMaxUnitPrice = 0.8 * LAMPORTS_PER_SOL;
      const newMinUnitPrice = 0.6 * LAMPORTS_PER_SOL;
      const newStartTime = now + 1800;
      const newEndTime = now + 5400;

      await program.methods
        .updateVault(
          newRecipient.publicKey,
          newMaxAmount,
          null,
          new anchor.BN(newMaxUnitPrice),
          new anchor.BN(newMinUnitPrice),
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
      expect(vaultAccount.maxUnitPrice.toString()).to.equal(newMaxUnitPrice.toString());
      expect(vaultAccount.minUnitPrice.toString()).to.equal(newMinUnitPrice.toString());
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
      expect(updatedVault.maxUnitPrice.toString()).to.equal(oldVaultState.maxUnitPrice.toString());
      expect(updatedVault.minUnitPrice.toString()).to.equal(oldVaultState.minUnitPrice.toString());
      expect(updatedVault.startTime.toString()).to.equal(oldVaultState.startTime.toString());
      expect(updatedVault.endTime.toString()).to.equal(oldVaultState.endTime.toString());
    });
  });
});
