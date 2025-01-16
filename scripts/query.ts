import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import IDL from "../target/idl/xnomad_launch.json";
import { XnomadLaunch } from "../target/types/xnomad_launch";

async function getVaultInfo(program: Program<XnomadLaunch>, vault: PublicKey) {
  const vaultInfo = await program.account.vault.fetch(vault);

  return {
    totalDeposited: vaultInfo.totalDeposited,
    totalNfts: vaultInfo.totalNfts,
    maxMintAmount: vaultInfo.maxMintAmount,
    whitelistMaxMintAmount: vaultInfo.whitelistMaxMintAmount,
    unitPrice: vaultInfo.unitPrice,
    startTime: vaultInfo.startTime,
    endTime: vaultInfo.endTime,
    recipient: vaultInfo.recipient,
    merkleRoot: vaultInfo.merkleRoot,
  }
}

async function getAllDeposits(program: Program<XnomadLaunch>, vault: PublicKey) {
  const accounts = await program.provider.connection.getProgramAccounts(program.programId, {
    filters: [
      {
        memcmp: {
          offset: 8 + 32 + 1 + 8, // 8 (discriminator) + 32 (user pubkey) + 1 (nft_amount) + 8 (deposit_amount)
          bytes: vault.toBase58(),
        },
      },
    ],
  });

  const verifiedDeposits: PublicKey[] = [];

  // filter out fake deposits
  for (const account of accounts) {
    let deposit;
    try {
      deposit = await program.coder.accounts.decode('userDeposit', account.account.data);
    } catch (e) {
      console.log('error decoding user deposit: ', e);
      continue;
    }

    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_deposit"), deposit.user.toBuffer(), vault.toBuffer()],
      program.programId
    )
    if (!pda.equals(account.pubkey)) {
      console.log('pda mismatch: ', pda.toBase58(), account.pubkey.toBase58());
      continue;
    }

    verifiedDeposits.push(account.pubkey);
  }

  const deposits = await program.account.userDeposit.fetchMultiple(verifiedDeposits);

  return deposits.map(deposit => ({
    user: deposit.user,
    nftAmount: deposit.nftAmount,
    depositAmount: deposit.depositAmount,
    vault: deposit.vault,
  }));
}

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'));
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()));
  const program = new Program<XnomadLaunch>(IDL as any, provider);

  const vault = new PublicKey('fill your vault address here');

  await getAllDeposits(program, vault);
  await getVaultInfo(program, vault);
}