import { clusterApiUrl, Connection } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { XnomadLaunch } from "../target/types/xnomad_launch";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import IDL from "../target/idl/xnomad_launch.json";
import fs from 'fs';
import { getMerkleRoot } from "@metaplex-foundation/mpl-core-candy-machine";

async function main() {
  const wallet = new Wallet(
    Keypair.fromSecretKey(
      Uint8Array.from(
        JSON.parse(fs.readFileSync('your wallet file', 'utf8'))
      )
    )
  )

  const connection = new Connection(clusterApiUrl('devnet'));
  const provider = new AnchorProvider(connection, wallet);
  const program = new Program<XnomadLaunch>(IDL as any, provider);

  const vault = new PublicKey('4Tt4eroC8vTp8J4pycwPBfFuAUJEhDqKUUDiFWB2ZH2v');
  const vaultInfo = await program.account.vault.fetch(vault);

  const res = await program.methods.deposit(1, null)
    .accounts({
      vault,
      user: provider.wallet.publicKey,
      recipient: vaultInfo.recipient,
    })
    .rpc();

  console.log('deposit success:', res);
}

main();

