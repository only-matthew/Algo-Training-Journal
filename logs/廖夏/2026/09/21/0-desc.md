# C. AND, OR, Sort!

时间限制：2 seconds

内存限制：256 megabytes

You are given a binary string$^{\text{∗}}$ $s$ of length $n$.

You may perform the following operation any number of times (possibly zero):

- choose an integer $i$ ($1 \le i \le n$), and replace $s_i$ with either the [bitwise AND](https://en.wikipedia.org/wiki/Bitwise_operation#AND) or the [bitwise OR](https://en.wikipedia.org/wiki/Bitwise_operation#OR) of $s_1, s_2, \ldots, s_i$.

Note that the bitwise AND or bitwise OR of a single element is equal to the element itself.

Your goal is to make $s$ sorted in non-decreasing order$^{\text{†}}$.

Find the minimum number of operations required to sort $s$ in non-decreasing order.

$^{\text{∗}}$A binary string only contains characters $\texttt{0}$ and $\texttt{1}$.

$^{\text{†}}$If $s$ is in non-decreasing order, then $s_1 \leq s_2 \leq \ldots \leq s_n$.

## Input

Input

The first line contains a single integer $t$ ($1 \le t \le 10^4$) — the number of test cases.

The first line of each test case contains a single integer $n$ ($2 \le n \le 2 \cdot 10^5$) — the length of the binary string $s$.

The second line of each test case contains the binary string $s$ of length $n$. Each character of $s$ is either 0 or 1.

It is guaranteed that the sum of $n$ over all test cases does not exceed $2 \cdot 10^5$.

## Output

Output

For each test case, print a single integer — the minimum number of operations required to sort $s$ in non-decreasing order.

Example

Input

```
640011410005010008010011017010101070111101
```

Output

```
031231
```

## Note

Note

In the first test case, the string is already sorted, so no operations are required.

In the second test case, we can use bitwise OR to change the last three characters to 1, obtaining 1111 in $3$ operations.