#include <bits/stdc++.h>
using namespace std;

int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    cin >> n >> m;
    vector<vector<int>> a(n, vector<int>(m));
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < m; j++)
        {
            char x;
            cin >> x;
            a[i][j] = (x == '*');
        }
    }
    int cntn = 0, cntm = 0;
    int x = -1, y = -1;
    int total = 0;
    for (int i = 0; i < n; i++)
    {
        int cnt = 0;
        for (int j = 0; j < m; j++)
        {
            if (a[i][j])
            {
                cnt++;
                total++;
            }
        }
        if (cnt >= 2)
        {
            cntn++;
            x = i;
        }
    }
    for (int j = 0; j < m; j++)
    {
        int cnt = 0;

        for (int i = 0; i < n; i++)
        {
            if (a[i][j])
            {
                cnt++;
            }
        }
        if (cnt >= 2)
        {
            cntm++;
            y = j;
        }
    }
    if (cntn != 1 || cntm != 1)
    {
        cout << "NO";
        return 0;
    }
    if (x == 0 || x == n - 1 || y == 0 || y == m - 1)
    {
        cout << "NO";
        return 0;
    }
    if (!a[x][y] || !a[x - 1][y] || !a[x + 1][y] ||
        !a[x][y - 1] || !a[x][y + 1])
    {
        cout << "NO";
        return 0;
    }
    int cnt = 1;
    for (int i = x - 1; i >= 0 && a[i][y]; i--)
    {
        cnt++;
    }
    for (int i = x + 1; i < n && a[i][y]; i++)
    {
        cnt++;
    }
    for (int j = y - 1; j >= 0 && a[x][j]; j--)
    {
        cnt++;
    }
    for (int j = y + 1; j < m && a[x][j]; j++)
    {
        cnt++;
    }
    if (cnt == total)
    {
        cout << "YES";
    }
    else
    {
        cout << "NO";
    }
    return 0;
}