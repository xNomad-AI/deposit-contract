use anchor_lang::prelude::*;

declare_id!("9r65eZV3ZGamTZnvWXShu7DQtAqTwS237LW13Aq69Umd");

#[program]
pub mod xnomad_launch {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
