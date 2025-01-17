use crate::errors::XNomadError;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn increment_deposit(
    ctx: Context<IncrementDeposit>,
    deposit_index: u8,
    new_unit_price: u64,
) -> Result<()> {
    let user_deposit = &mut ctx.accounts.user_deposit;
    let vault = &mut ctx.accounts.vault;

    // Validate deposit index
    require!(
        (deposit_index as usize) < user_deposit.deposits.len(),
        XNomadError::InvalidDepositIndex
    );

    let deposit = &mut user_deposit.deposits[deposit_index as usize];
    let original_deposit_amount = deposit.deposit_amount;
    let nft_amount = deposit.nft_amount;

    // Verify new unit price is higher than original
    let original_unit_price = original_deposit_amount / (nft_amount as u64);
    require!(
        new_unit_price > original_unit_price,
        XNomadError::InvalidIncrementPrice
    );

    // Verify new unit price is within allowed range
    require!(
        new_unit_price >= vault.min_unit_price && new_unit_price <= vault.max_unit_price,
        XNomadError::InvalidUnitPrice
    );

    // Calculate increment amount
    let new_deposit_amount = (nft_amount as u64) * new_unit_price;
    let increment_amount = new_deposit_amount - original_deposit_amount;

    // Verify user has sufficient balance
    require!(
        ctx.accounts.user.lamports() >= increment_amount,
        XNomadError::InsufficientFunds
    );

    // Transfer increment amount
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
        ),
        increment_amount,
    )?;

    // Update deposit record
    deposit.deposit_amount = new_deposit_amount;

    // Update totals
    user_deposit.total_deposit_amount += increment_amount;
    vault.total_deposited += increment_amount;

    // Emit event
    emit!(IncrementDepositEvent {
        user: ctx.accounts.user.key(),
        vault: vault.key(),
        deposit_index,
        original_deposit_amount,
        new_deposit_amount,
        increment_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct IncrementDepositEvent {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub deposit_index: u8,
    pub original_deposit_amount: u64,
    pub new_deposit_amount: u64,
    pub increment_amount: u64,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct IncrementDeposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This is safe as we just read the pubkey
    #[account(
        mut,
        constraint = recipient.key() == vault.recipient @ XNomadError::InvalidRecipient
    )]
    pub recipient: AccountInfo<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"user_deposit", user.key().as_ref(), vault.key().as_ref()],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    pub system_program: Program<'info, System>,
}
