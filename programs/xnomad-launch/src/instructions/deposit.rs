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

    require!(nft_amount > 0, XNomadError::InvalidNftAmount);

    // Calculate total NFT amount including current deposit
    let total_nft_amount = ctx.accounts.user_deposit.total_nft_amount + nft_amount;

    let is_whitelist = merkle_proof.is_some();

    // Check mint amount limit
    let mint_limit = if is_whitelist {
        vault.whitelist_max_mint_amount
    } else {
        vault.max_mint_amount
    };
    require!(
        total_nft_amount <= mint_limit,
        XNomadError::ExceedsMintLimit
    );

    // If merkle proof is provided, verify it
    if let Some(proof) = merkle_proof {
        require!(
            verify_proof(
                &proof,
                vault.merkle_root,
                keccak::hashv(&[ctx.accounts.user.key().as_ref()]).to_bytes()
            ),
            XNomadError::InvalidMerkleProof
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

    // Initialize if first deposit
    if user_deposit.deposits.is_empty() {
        user_deposit.user = ctx.accounts.user.key();
        user_deposit.vault = ctx.accounts.vault.key();
        user_deposit.total_nft_amount = 0;
        user_deposit.total_deposit_amount = 0;
    }

    // Add new deposit to the array
    user_deposit.deposits.push(DepositInfo {
        nft_amount,
        deposit_amount,
        timestamp: clock.unix_timestamp,
    });

    // Update totals
    user_deposit.total_nft_amount = total_nft_amount;
    user_deposit.total_deposit_amount += deposit_amount;

    // Update vault state
    let vault = &mut ctx.accounts.vault;
    vault.total_deposited += deposit_amount;
    vault.total_nfts += nft_amount as u64;

    // Emit deposit event
    emit!(DepositEvent {
        user: ctx.accounts.user.key(),
        vault: ctx.accounts.vault.key(),
        nft_amount,
        deposit_amount,
        is_whitelist,
        timestamp: clock.unix_timestamp,
    });

    // Check deposit times limit
    require!(
        ctx.accounts.user_deposit.deposits.len() < 10,
        XNomadError::ExceedsDepositLimit
    );

    Ok(())
}

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub vault: Pubkey,
    pub nft_amount: u8,
    pub deposit_amount: u64,
    pub is_whitelist: bool,
    pub timestamp: i64,
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
            1 + // total_nft_amount: u8
            8 + // total_deposit_amount: u64
            32 + // vault: Pubkey
            4 + // Vec length
            (1 + 8 + 8) * 10, // 空间最多存储10次存款 (nft_amount + deposit_amount + timestamp)
        seeds = [b"user_deposit", user.key().as_ref(), vault.key().as_ref()],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    pub system_program: Program<'info, System>,
}
