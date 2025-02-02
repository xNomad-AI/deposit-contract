use anchor_lang::prelude::*;

#[error_code]
pub enum XNomadError {
    #[msg("Exceeds mint limit")]
    ExceedsMintLimit,

    #[msg("Insufficient funds")]
    InsufficientFunds,

    #[msg("Invalid recipient")]
    InvalidRecipient,

    #[msg("Invalid mint amount configuration")]
    InvalidMintAmount,

    #[msg("Invalid time configuration")]
    InvalidTimeConfig,

    #[msg("Deposit not started yet")]
    NotStarted,

    #[msg("Deposit period ended")]
    Ended,

    #[msg("Only vault owner can perform this action")]
    UnauthorizedOwner,

    #[msg("Invalid merkle proof")]
    InvalidMerkleProof,

    #[msg("Exceeds maximum deposit times limit")]
    ExceedsDepositLimit,

    #[msg("Invalid NFT amount")]
    InvalidNftAmount,

    #[msg("Invalid price configuration")]
    InvalidPriceConfig,

    #[msg("Invalid unit price")]
    InvalidUnitPrice,

    #[msg("Invalid deposit index")]
    InvalidDepositIndex,

    #[msg("New unit price must be higher than original")]
    InvalidIncrementPrice,
}
