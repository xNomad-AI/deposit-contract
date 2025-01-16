use crate::errors::XNomadError;
use crate::state::*;
use crate::utils::verify_proof;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

pub fn deposit(
    ctx: Context<Deposit>,
    nft_amount: u8,
    merkle_proof: Option<Vec<[u8; 32]>>,
) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp >= vault.start_time,
        XNomadError::NotStarted
    );
    require!(clock.unix_timestamp <= vault.end_time, XNomadError::Ended);

    // Calculate total NFT amount including current deposit
    let total_nft_amount = if ctx.accounts.user_deposit.nft_amount == 0 {
        nft_amount
    } else {
        ctx.accounts.user_deposit.nft_amount + nft_amount
    };

    // If merkle proof is provided, verify it and check whitelist limit
    if let Some(proof) = merkle_proof {
        // Calculate leaf from user's address
        let mut hasher = keccak::Hasher::default();
        hasher.hash(ctx.accounts.user.key().as_ref());
        let leaf = hasher.result().to_bytes();

        require!(
            verify_proof(&proof, vault.merkle_root, leaf),
            XNomadError::InvalidMerkleProof
        );

        require!(
            total_nft_amount <= vault.whitelist_max_mint_amount,
            XNomadError::ExceedsWhitelistLimit
        );
    } else {
        require!(
            total_nft_amount <= vault.max_mint_amount,
            XNomadError::ExceedsMintLimit
        );
    }

    let deposit_amount = (nft_amount as u64) * vault.unit_price;
    require!(
        ctx.accounts.user.lamports() >= deposit_amount,
        XNomadError::InsufficientFunds
    );

    // Transfer SOL from user to vault's recipient
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
        ),
        deposit_amount,
    )?;

    // Update user deposit info
    let user_deposit = &mut ctx.accounts.user_deposit;
    user_deposit.user = ctx.accounts.user.key();
    user_deposit.nft_amount = total_nft_amount; // Store total amount
    user_deposit.deposit_amount += deposit_amount; // Add to existing deposit
    user_deposit.vault = ctx.accounts.vault.key();

    // Update vault state
    let vault = &mut ctx.accounts.vault;
    vault.total_deposited += deposit_amount;
    vault.total_nfts += nft_amount as u64;

    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
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
        init_if_needed,
        payer = user,
        space = 8 + // discriminator
            32 + // user: Pubkey
            1 + // nft_amount: u8
            8 + // deposit_amount: u64
            32, // vault: Pubkey
        seeds = [b"user_deposit", user.key().as_ref(), vault.key().as_ref()],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    pub system_program: Program<'info, System>,
}
