#include <bits/stdc++.h>
using namespace std;
int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int l, s, t, m, temp;
    cin >> l;
    cin >> s >> t >> m;
    vector<int> v(m);
    for (int i = 0; i < m; i++)
    {
        cin >> v[i];
    }
    sort(v.begin(),v.end());
    if (s == t)
    {
        int ans = 0;
        for (int i = 0; i < m; i++)
        {
            if (v[i] % s == 0)
            {
                ans++;
            }
        }
        cout << ans << '\n';
        return 0;
    }
    vector<int> a(11000, 0);
    int last = 0;
    int now = 0;
    for (int i = 0; i < m; i++)
    {
        now += min(v[i] - last, 100);
        a[now] = 1;
        last = v[i];
    }
    l = now + min(l - last, 100);
    const int INF = 1e9;
    vector<int> dp(l + t + 1, INF);
    dp[0] = 0;
    for (int i = 1; i <= l + t; i++)
    {
        for (int j = i - t; j <= i - s; j++)
        {
            if (j >= 0)
            {
                dp[i] = min(dp[i], dp[j] + a[i]);
            }
        }
    }
    int ans = INF;
    for (int i = l; i <= l + t; i++)
    {
        ans = min(ans, dp[i]);
    }
    cout << ans << '\n';
    return 0;
}