use crate::errors::XNomadError;
use crate::utils::verify_proof;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

pub fn verify_merkle_proof(
    _ctx: Context<VerifyMerkleProof>,
    root: [u8; 32],
    proof: Vec<[u8; 32]>,
    address: Pubkey,
) -> Result<()> {
    // Calculate leaf from address
    let mut hasher = keccak::Hasher::default();
    hasher.hash(address.as_ref());
    let leaf = hasher.result().to_bytes();

    require!(
        verify_proof(&proof, root, leaf),
        XNomadError::InvalidMerkleProof
    );
    msg!(
        "Merkle proof verified successfully for address: {}",
        address
    );
    Ok(())
}

#[derive(Accounts)]
pub struct VerifyMerkleProof<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}
