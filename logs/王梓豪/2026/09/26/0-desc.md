C. GCD Treasury
time limit per test2 seconds
memory limit per test256 megabytes

The greedy pirate Dimash found a treasury. It consists of n
 piles of coins, numbered from 1
 to n
. The i
-th pile contains exactly ai
 coins. Pirate Dimash has a number x
 that he can use to steal coins from the treasury. The stealing process works as follows:

First, he chooses an index 1≤i≤n
 such that ai>0
 and gcd
∗
(ai,x)≠1
. If there is no such index, the pirate stops.
Now let gcd(ai,x)
 be g
. The pirate steals exactly g
 coins from pile i
, after which ai
 decreases by g
.
Finally, he sets x
 to g
 and continues stealing coins.
Your task is to help the pirate steal the maximum possible number of coins. Find the maximum number of coins that can be stolen from the treasury.

∗
gcd(ai,x)
 denotes the greatest common divisor (GCD) of integers ai
 and x
.

Input
Each test contains multiple test cases. The first line contains the number of test cases t
 (1≤t≤104
). The description of the test cases follows.

The first line of each test case contains two integers n
 and x
 (1≤n,x≤3⋅105
) — the number of piles of coins in the treasury and the pirate's number.

The second line of each test case contains n
 integers a1,a2,…an
 (1≤ai≤3⋅105
).

It is guaranteed that the sum of n
 over all test cases does not exceed 3⋅105
.

Output
For each test case, output one number — the maximum number of coins that can be stolen.