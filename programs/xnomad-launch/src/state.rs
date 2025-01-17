use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    pub total_deposited: u64,
    pub total_nfts: u64,
    pub recipient: Pubkey,
    pub max_mint_amount: u8,
    pub whitelist_max_mint_amount: u8,
    pub max_unit_price: u64,
    pub min_unit_price: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub owner: Pubkey,
    pub merkle_root: [u8; 32],
}

#[account]
pub struct UserDeposit {
    pub user: Pubkey,
    pub total_nft_amount: u8,
    pub total_deposit_amount: u64,
    pub deposits: Vec<DepositInfo>,
    pub vault: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct DepositInfo {
    pub nft_amount: u8,
    pub deposit_amount: u64,
    pub timestamp: i64,
}
