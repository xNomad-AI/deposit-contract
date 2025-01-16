use crate::errors::XNomadError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn update_vault(
    ctx: Context<UpdateVault>,
    recipient: Option<Pubkey>,
    max_mint_amount: Option<u8>,
    whitelist_max_mint_amount: Option<u8>,
    unit_price: Option<u64>,
    start_time: Option<i64>,
    end_time: Option<i64>,
    merkle_root: Option<[u8; 32]>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    if let Some(new_recipient) = recipient {
        vault.recipient = new_recipient;
    }

    if let Some(new_max) = max_mint_amount {
        vault.max_mint_amount = new_max;
    }

    if let Some(new_price) = unit_price {
        vault.unit_price = new_price;
    }

    if let Some(new_whitelist_max) = whitelist_max_mint_amount {
        vault.whitelist_max_mint_amount = new_whitelist_max;
    }

    if let Some(new_start) = start_time {
        let new_end = end_time.unwrap_or(vault.end_time);
        require!(
            new_start < new_end && new_start > 0,
            XNomadError::InvalidTimeConfig
        );
        vault.start_time = new_start;
    }

    if let Some(new_end) = end_time {
        require!(
            new_end > start_time.unwrap_or(vault.start_time),
            XNomadError::InvalidTimeConfig
        );
        vault.end_time = new_end;
    }

    if let Some(new_root) = merkle_root {
        vault.merkle_root = new_root;
    }

    emit!(UpdateVaultEvent {
        vault: vault.key(),
        recipient: recipient,
        unit_price: unit_price,
        max_mint_amount: max_mint_amount,
        whitelist_max_mint_amount: whitelist_max_mint_amount,
        merkle_root: merkle_root,
        start_time: start_time,
        end_time: end_time,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct UpdateVaultEvent {
    pub vault: Pubkey,
    pub recipient: Option<Pubkey>,
    pub unit_price: Option<u64>,
    pub max_mint_amount: Option<u8>,
    pub whitelist_max_mint_amount: Option<u8>,
    pub merkle_root: Option<[u8; 32]>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct UpdateVault<'info> {
    #[account(
        mut,
        constraint = vault.owner == owner.key() @ XNomadError::UnauthorizedOwner
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub owner: Signer<'info>,
}
