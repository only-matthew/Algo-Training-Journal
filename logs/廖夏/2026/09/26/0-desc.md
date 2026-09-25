# C. GCD Treasury

时间限制：2 seconds

内存限制：256 megabytes

The greedy pirate Dimash found a treasury. It consists of $n$ piles of coins, numbered from $1$ to $n$. The $i$-th pile contains exactly $a_i$ coins. Pirate Dimash has a number $x$ that he can use to steal coins from the treasury. The stealing process works as follows:

- First, he chooses an index $1\le i\le n$ such that $a_i\gt 0$ and $\gcd$$^{\text{∗}}$$(a_i, x) \neq 1$. If there is no such index, the pirate stops.
- Now let $\gcd(a_i, x)$ be $g$. The pirate steals exactly $g$ coins from pile $i$, after which $a_i$ decreases by $g$.
- Finally, he sets $x$ to $g$ and continues stealing coins.

Your task is to help the pirate steal the maximum possible number of coins. Find the maximum number of coins that can be stolen from the treasury.

$^{\text{∗}}$$\gcd(a_i, x)$ denotes the [greatest common divisor (GCD)](https://en.wikipedia.org/wiki/Greatest_common_divisor) of integers $a_i$ and $x$.

## Input

Input

Each test contains multiple test cases. The first line contains the number of test cases $t$ ($1 \le t \le 10^4$). The description of the test cases follows.

The first line of each test case contains two integers $n$ and $x$ ($1\le n, x\le 3\cdot 10^5$) — the number of piles of coins in the treasury and the pirate's number.

The second line of each test case contains $n$ integers $a_1, a_2, \ldots a_n$ ($1 \le a_i \le 3\cdot 10^5$).

It is guaranteed that the sum of $n$ over all test cases does not exceed $3\cdot 10^5$.

## Output

Output

For each test case, output one number — the maximum number of coins that can be stolen.

Example

Input

```
53 12 3 53 42 3 44 22 2 2 26 62 3 2 3 2 37 69 9 4 4 4 4 4
```

Output

```
068920
```

## Note

Note

In the first test case, no coin can be stolen.

In the second test case, the pirate steals as follows.

- The pirate chooses pile number $3$. He takes $4$ coins, after which the treasury becomes $[2, 3, 0]$ and $x$ becomes $4$.
- The pirate chooses pile number $1$. He takes $2$ coins, after which the treasury becomes $[0, 3, 0]$, and $x$ becomes $2$.
- No suitable indices remain, so the pirate stops. The pirate managed to take $4 + 2 = 6$ coins.