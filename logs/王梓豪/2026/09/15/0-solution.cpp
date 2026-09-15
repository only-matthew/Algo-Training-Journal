#include <bits/stdc++.h>
using namespace std;

int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int temp;
    vector<int> a;

    while (cin >> temp)
    {
        a.emplace_back(temp);
    }
    vector<int> dp;

    for (int i = 0; i < (int)a.size(); i++)
    {
        int temp = -a[i];
        int pos = upper_bound(dp.begin(), dp.end(), temp) - dp.begin();

        if (pos == (int)dp.size())
        {
            dp.emplace_back(temp);
        }
        else
        {
            dp[pos] = temp;
        }
    }
    int ans = dp.size();
    dp.clear();
    for (int i = 0; i < (int)a.size(); i++)
    {
        int pos = lower_bound(dp.begin(), dp.end(), a[i]) - dp.begin();

        if (pos == (int)dp.size())
        {
            dp.emplace_back(a[i]);
        }
        else
        {
            dp[pos] = a[i];
        }
    }
    int cnt = dp.size();
    cout << ans << endl;
    cout << cnt << endl;
    return 0;
}