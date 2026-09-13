#include <bits/stdc++.h>
using namespace std;

using int64 = long long;

int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int t;
    cin >> t;

    while (t--)
    {
        int n;
        cin >> n;

        /*
            这里必须使用 long long。

            原来的 vector<int> 在本题数据范围下可能不够安全，
            而且答案可能达到 1e14 级别。
        */
        vector<int64> v(n), add(n);

        for (int i = 0; i < n; i++)
        {
            cin >> v[i];
        }

        /*
            add[i] 表示环上的边：

                i <-> (i + 1) % n

            来回走一次时，会访问这两个点各一次，
            因此新增代价是：

                v[i] + v[(i + 1) % n]
        */

        /*
            注意：

            原代码写成了：

                add[i] = v[i] += v[(i + 1) % n];

            这样会把原来的 v[i] 改掉。
            后面计算路径代价时还需要使用原始点权，
            所以这里只计算 add，不修改 v。
        */
        for (int i = 0; i < n; i++)
        {
            add[i] = v[i] + v[(i + 1) % n];
        }

        /*
            prefix 用来计算环上连续一段点权的和。

            我们暂时把环展开成一条整数轴：

                ... -2, -1, 0, 1, 2, ...

            位置 k 对应环上的：

                k % n

            例如 n = 4 时：

                k:       -2  -1   0   1   2   3
                环下标:    2   3   0   1   2   3
        */

        int m = n - 1;

        // 最远只会走到 -(n - 1) 或 n - 1
        int left = -m;
        int right = m;

        int length = right - left + 1;

        vector<int64> prefix(length + 1, 0);

        for (int k = left; k <= right; k++)
        {
            // C++ 中负数取模可能为负，所以需要这样处理。
            int index = ((k % n) + n) % n;

            prefix[k - left + 1] =
                prefix[k - left] + v[index];
        }

        /*
            获取整数位置 k 对应的环上点权。

            例如 n = 4：

                getValue(-1) = v[3]
                getValue(-2) = v[2]
        */
        auto getValue = [&](int k) -> int64
        {
            int index = ((k % n) + n) % n;
            return v[index];
        };

        /*
            获取整数位置 [l, r] 上所有点权的总和。

            例如：

                getSum(1, 3)
                = v[1] + v[2] + v[3]

            当 l > r 时，表示区间为空。
        */
        auto getSum = [&](int l, int r) -> int64
        {
            if (l > r)
            {
                return 0;
            }

            return prefix[r - left + 1] - prefix[l - left];
        };

        /*
            计算：

                从位置 0 走到位置 x，
                再按照原路返回位置 0

            的路径代价。

            注意起点和终点虽然在环上对应同一个编号 0，
            但它们是网格中的两个不同格子：

                起点是 (0, 0)
                终点是 (n - 1, n - 1)

            所以当 x != 0 时，位置 0 要被计算两次。
        */
        auto costToBack = [&](int x) -> int64
        {
            /*
                x = 0 时，不能直接认为已经走了一条路径。

                后面如果在相邻边上来回，
                初始位置 0 只需要先计算一次。
            */
            if (x == 0)
            {
                return getValue(0);
            }

            if (x > 0)
            {
                /*
                    路径：

                        0 -> 1 -> 2 -> ... -> x
                          -> x-1 -> ... -> 1 -> 0

                    其中：

                    - 位置 0 出现两次；
                    - 位置 x 出现一次；
                    - 1 到 x-1 中间的点出现两次。
                */
                return 2LL * getValue(0)
                     + getValue(x)
                     + 2LL * getSum(1, x - 1);
            }
            else
            {
                /*
                    x < 0 时同理：

                        0 -> -1 -> -2 -> ... -> x
                          -> x+1 -> ... -> -1 -> 0
                */
                return 2LL * getValue(0)
                     + getValue(x)
                     + 2LL * getSum(x + 1, -1);
            }
        };

        int64 ans = LLONG_MAX;

        /*
            枚举最远位置 x。

            x 可以在：

                -(n - 1) <= x <= n - 1

            例如 x = 2，表示先从 0 走到 2，再返回。
            x = -2，表示先从 0 走到 -2，再返回。
        */
        for (int x = -m; x <= m; x++)
        {
            /*
                走到 x 再返回 0，需要：

                    2 * abs(x)

                步。

                总共必须走：

                    2 * (n - 1)

                步。

                所以剩下的步数为：

                    2 * (n - 1 - abs(x))

                这些步必须组成若干次来回。
            */
            int remaining = m - abs(x);

            int64 baseCost = costToBack(x);

            /*
                情况一：

                    在边 x <-> x - 1 上来回。

                add[x - 1] 表示这条边的来回代价。

                因为 x 可能为负数，所以不能直接访问 add[x - 1]，
                必须先转换成 [0, n - 1] 的环下标。
            */
            int edge1 = ((x - 1) % n + n) % n;

            int64 current1 =
                baseCost + 1LL * remaining * add[edge1];

            ans = min(ans, current1);

            /*
                情况二：

                    在边 x <-> x + 1 上来回。

                add[x] 表示这条边的来回代价。
            */
            int edge2 = ((x % n) + n) % n;

            int64 current2 =
                baseCost + 1LL * remaining * add[edge2];

            ans = min(ans, current2);
        }

        cout << ans << '\n';
    }

    return 0;
}