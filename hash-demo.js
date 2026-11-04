/*
Answers:

1. bcrypt generates a random salt for each password hash.
   This makes two hashes of the same password look different.

2. No. A hash is one-way. You cannot directly reverse it
   to recover the original password.

3. bcrypt is intentionally slow. This makes large numbers
   of password guesses more expensive for attackers.
*/

const bcrypt = require('bcryptjs');

async function demo() {
    const hash1 = await bcrypt.hash('password123', 12);
    const hash2 = await bcrypt.hash('password123', 12);

    console.log('Hash 1:', hash1);
    console.log('Hash 2:', hash2);

    console.log(
        'Right password, hash 1:',
        await bcrypt.compare('password123', hash1)
    );

    console.log(
        'Right password, hash 2:',
        await bcrypt.compare('password123', hash2)
    );

    console.log(
        'Wrong password, hash 1:',
        await bcrypt.compare('password124', hash1)
    );
}

demo().catch(error => {
    console.error('Hash demo failed:', error);
    process.exitCode = 1;
});