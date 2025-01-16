use crate::errors::XNomadError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn initialize_vault(
    ctx: Context<InitializeVault>,
    recipient: Pubkey,
    max_mint_amount: u8,
    whitelist_max_mint_amount: u8,
    unit_price: u64,
    start_time: i64,
    end_time: i64,
    merkle_root: [u8; 32],
) -> Result<()> {
    require!(
        whitelist_max_mint_amount > max_mint_amount,
        XNomadError::InvalidMintAmount
    );
    require!(
        start_time < end_time && start_time > 0,
        XNomadError::InvalidTimeConfig
    );

    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = 0;
    vault.total_nfts = 0;
    vault.recipient = recipient;
    vault.max_mint_amount = max_mint_amount;
    vault.whitelist_max_mint_amount = whitelist_max_mint_amount;
    vault.unit_price = unit_price;
    vault.start_time = start_time;
    vault.end_time = end_time;
    vault.owner = ctx.accounts.payer.key();
    vault.merkle_root = merkle_root;
    Ok(())
}

#[derive(Accounts)]
#[instruction(recipient: Pubkey, max_mint_amount: u8, whitelist_max_mint_amount: u8, unit_price: u64, start_time: i64, end_time: i64, merkle_root: [u8; 32])]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + // discriminator
            8 + // total_deposited: u64
            8 + // total_nfts: u64
            32 + // recipient: Pubkey
            1 + // max_mint_amount: u8
            1 + // whitelist_max_mint_amount: u8
            8 + // unit_price: u64
            8 + // start_time: i64
            8 + // end_time: i64
            32 + // owner: Pubkey
            32 // merkle_root: [u8; 32]
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
