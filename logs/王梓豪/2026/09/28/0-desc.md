Integer Triple
Input file: standard input
Output file: standard output
Time limit: 1 second
Memory limit: 512 megabytes
Given an integer n, find three integers a, b, c satisfying
• |a|, |b|, |c| ≤ 1018;
• n = ab(a + b) + bc(b + c) + ac(a + c).
If no such triple of integers exists, report that there is no solution.
Input
The input contains one integer n (0 ≤ n ≤ 1018).
Output
If there is no solution, output −1. Otherwise, output three integers a, b, c that satisfy all the requirements.
If there are multiple valid answers, output any one of them.
Examples
standard input standard output
3 -1
6 1 1 1