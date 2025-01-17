use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("56SUkQRjKkAJzB1esPwn25tgvsW3TuwgzncvUh5rGT1C");

#[program]
pub mod xnomad_launch {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        recipient: Pubkey,
        max_mint_amount: u8,
        whitelist_max_mint_amount: u8,
        max_unit_price: u64,
        min_unit_price: u64,
        start_time: i64,
        end_time: i64,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_vault(
            ctx,
            recipient,
            max_mint_amount,
            whitelist_max_mint_amount,
            max_unit_price,
            min_unit_price,
            start_time,
            end_time,
            merkle_root,
        )
    }

    pub fn deposit(
        ctx: Context<Deposit>,
        nft_amount: u8,
        unit_price: u64,
        merkle_proof: Option<Vec<[u8; 32]>>,
    ) -> Result<()> {
        instructions::deposit(ctx, nft_amount, unit_price, merkle_proof)
    }

    pub fn update_vault(
        ctx: Context<UpdateVault>,
        recipient: Option<Pubkey>,
        max_mint_amount: Option<u8>,
        whitelist_max_mint_amount: Option<u8>,
        max_unit_price: Option<u64>,
        min_unit_price: Option<u64>,
        start_time: Option<i64>,
        end_time: Option<i64>,
        merkle_root: Option<[u8; 32]>,
    ) -> Result<()> {
        instructions::update_vault(
            ctx,
            recipient,
            max_mint_amount,
            whitelist_max_mint_amount,
            max_unit_price,
            min_unit_price,
            start_time,
            end_time,
            merkle_root,
        )
    }

    pub fn verify_merkle_proof(
        ctx: Context<VerifyMerkleProof>,
        root: [u8; 32],
        proof: Vec<[u8; 32]>,
        address: Pubkey,
    ) -> Result<()> {
        instructions::verify_merkle_proof(ctx, root, proof, address)
    }
}
