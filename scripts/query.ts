import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, Finality, Keypair, PartiallyDecodedInstruction, PublicKey } from "@solana/web3.js";
import IDL from "../target/idl/xnomad_launch.json";
import { XnomadLaunch } from "../target/types/xnomad_launch";
import base58 from 'bs58';
import { getMerkleProof, getMerkleRoot } from "@metaplex-foundation/mpl-core-candy-machine";
import { EventParser, BN } from "@coral-xyz/anchor";

async function getVaultInfo(program: Program<XnomadLaunch>, vault: PublicKey) {
  const vaultInfo = await program.account.vault.fetch(vault);

  return {
    totalDeposited: vaultInfo.totalDeposited,
    totalNfts: vaultInfo.totalNfts,
    maxMintAmount: vaultInfo.maxMintAmount,
    whitelistMaxMintAmount: vaultInfo.whitelistMaxMintAmount,
    maxUnitPrice: vaultInfo.maxUnitPrice,
    minUnitPrice: vaultInfo.minUnitPrice,
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
    totalNftAmount: deposit.totalNftAmount,
    totalDepositAmount: deposit.totalDepositAmount,
    vault: deposit.vault,
    deposits: deposit.deposits.map(d => ({
      nftAmount: d.nftAmount,
      depositAmount: d.depositAmount,
      timestamp: d.timestamp,
    })),
  }));
}

async function getUserDepositInfo(program: Program<XnomadLaunch>, vault: PublicKey, user: PublicKey) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_deposit"), user.toBuffer(), vault.toBuffer()],
    program.programId
  );
  try {
    const deposit = await program.account.userDeposit.fetch(pda);
    return deposit;
  } catch (e) {
    return null;
  }
}

async function getRecentDepositEvents(program: Program<XnomadLaunch>, vault: PublicKey, limit: number, commitment: Finality = 'confirmed') {
  const signatures = await program.provider.connection.getSignaturesForAddress(vault, {
    limit,
  }, commitment);

  const transactions = await program.provider.connection.getParsedTransactions(signatures.map(s => s.signature), commitment);

  const events = transactions.flatMap(tx => {
    const eventParser = new EventParser(program.programId, program.coder);
    const events = Array.from(eventParser.parseLogs(tx.meta.logMessages));
    return events;
  })

  return events.filter(e => e.name === 'depositEvent').map(e => ({
    user: e.data.user as PublicKey,
    vault: e.data.vault as PublicKey,
    nftAmount: e.data.nftAmount as number,
    depositAmount: e.data.depositAmount as BN,
    isWhitelist: e.data.isWhitelist as boolean,
    timestamp: e.data.timestamp as BN,
  }));
}

async function main() {
  const connection = new Connection(clusterApiUrl('devnet'));
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()));
  const program = new Program<XnomadLaunch>(IDL as any, provider);

  const vault = new PublicKey('84maKtDadorM3XxoK4wak82i4aTXgQ4phNsGDJkosFtG');

  const vaultInfo = await getVaultInfo(program, vault);
  console.log(vaultInfo);

  const deposits = await getAllDeposits(program, vault);
  console.log(deposits);

  const events = await getRecentDepositEvents(program, vault, 2);
  console.log(events);

  // const userDeposit = await getUserDepositInfo(program, vault, new PublicKey('user pubkey'));
  // console.log(userDeposit);
}

main()