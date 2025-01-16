use anchor_lang::solana_program::keccak;

pub fn verify_proof(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut current = leaf;
    for proof_element in proof.iter() {
        current = if current <= *proof_element {
            keccak::hashv(&[&current, proof_element]).to_bytes()
        } else {
            keccak::hashv(&[proof_element, &current]).to_bytes()
        };
    }
    current == root
}
