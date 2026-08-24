#include <bits/stdc++.h>
using namespace std;
string solve(string a, int k)
{
    if (a.empty())
    {
        return "";
    }
    int max_=-1,cnt = 0;
    int len=min((int)a.size(), k);
    for (int i = 0; i < len; i++)
    {
        if (a[i] - '0' > max_)
        {
            max_ = a[i] - '0';
            cnt = 1;
        }
        else if (a[i] - '0' == max_)
        {
            cnt++;
        }
    }
    string best = a;
    for (int i = 0; i < len; i++)
    {
        if (a[i] - '0' == max_)
        {
            string s = a;
            reverse(s.begin(), s.begin() + i + 1);
            if (s > best)
            {
                best = s;
            }
        }
    }
    string s;
    if (a.size() == 1)
    {
        s = a;
    }
    else
    {
        s = string(1, a[0]) + solve(a.substr(1), k);
    }
    if (s > best)
    {
        best = s;
    }
    return best;
}
int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, k;
    cin >> n >> k;
    long long temp, total = 0;
    for (int i = 0; i < n; i++)
    {
        cin >> temp;
        total += temp;
    }
    string a = to_string(total);
    string ans = solve(a, k);
    long long result = 0;
    for (char c : ans)
    {
        result = result * 10 + c - '0';
    }
    cout << result << '\n';
    return 0;
}