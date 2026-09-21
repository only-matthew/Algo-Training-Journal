C. AND, OR, Sort!
time limit per test2 seconds
memory limit per test256 megabytes
You are given a binary string∗
 s
 of length n
.

You may perform the following operation any number of times (possibly zero):

choose an integer i
 (1≤i≤n
), and replace si
 with either the bitwise AND or the bitwise OR of s1,s2,…,si
.
Note that the bitwise AND or bitwise OR of a single element is equal to the element itself.

Your goal is to make s
 sorted in non-decreasing order†
.

Find the minimum number of operations required to sort s
 in non-decreasing order.

∗
A binary string only contains characters 0
 and 1
.

†
If s
 is in non-decreasing order, then s1≤s2≤…≤sn
.

Input
The first line contains a single integer t
 (1≤t≤104
) — the number of test cases.

The first line of each test case contains a single integer n
 (2≤n≤2⋅105
) — the length of the binary string s
.

The second line of each test case contains the binary string s
 of length n
. Each character of s
 is either 0 or 1.

It is guaranteed that the sum of n
 over all test cases does not exceed 2⋅105
.

Output
For each test case, print a single integer — the minimum number of operations required to sort s
 in non-decreasing order.

Example
InputCopy
6
4
0011
4
1000
5
01000
8
01001101
7
0101010
7
0111101
OutputCopy
0
3
1
2
3
1
Note
In the first test case, the string is already sorted, so no operations are required.

In the second test case, we can use bitwise OR to change the last three characters to 1, obtaining 1111 in 3
 operations.