use crate::errors::XNomadError;
use crate::state::*;
use anchor_lang::prelude::*;

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
    require!(
        whitelist_max_mint_amount > max_mint_amount,
        XNomadError::InvalidMintAmount
    );
    require!(
        start_time < end_time && start_time > 0,
        XNomadError::InvalidTimeConfig
    );
    require!(
        max_unit_price >= min_unit_price,
        XNomadError::InvalidPriceConfig
    );

    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = 0;
    vault.total_nfts = 0;
    vault.recipient = recipient;
    vault.max_mint_amount = max_mint_amount;
    vault.whitelist_max_mint_amount = whitelist_max_mint_amount;
    vault.max_unit_price = max_unit_price;
    vault.min_unit_price = min_unit_price;
    vault.start_time = start_time;
    vault.end_time = end_time;
    vault.owner = ctx.accounts.payer.key();
    vault.merkle_root = merkle_root;

    emit!(InitializeVaultEvent {
        vault: vault.key(),
        recipient,
        max_unit_price,
        min_unit_price,
        max_mint_amount,
        whitelist_max_mint_amount,
        merkle_root,
        start_time,
        end_time,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct InitializeVaultEvent {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub max_unit_price: u64,
    pub min_unit_price: u64,
    pub max_mint_amount: u8,
    pub whitelist_max_mint_amount: u8,
    pub merkle_root: [u8; 32],
    pub start_time: i64,
    pub end_time: i64,
    pub timestamp: i64,
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
            8 + // max_unit_price: u64
            8 + // min_unit_price: u64
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
