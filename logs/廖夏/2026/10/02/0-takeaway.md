虽然这道题的各种标签都是 DP 什么的，但是也有 DFS 的标签，何况是在 DFS 内，我拼尽全力写了一个普通的 DFS 后，只能AC一半的点。在 GPT 给出的剪枝方案下，成功一步步走到了90分，最后三个TLE的点需要MST或DP，以后再做。

-  引入 dis数组，两个点的距离
- `if (distance >= ans) return;`
- 优先搜近的点，使得 ans 初值尽可能的小（greedy)