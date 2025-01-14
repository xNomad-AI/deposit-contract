import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { XnomadLaunch } from "../target/types/xnomad_launch";

describe("xnomad-launch", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.XnomadLaunch as Program<XnomadLaunch>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
