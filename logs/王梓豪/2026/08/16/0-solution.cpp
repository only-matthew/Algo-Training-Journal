#include <bits/stdc++.h>
using namespace std;
int b[10] = {0};
void print(__int128 num)
{
    if (num < 0)
    {
        putchar('-');
        num = -num;
    }
    if (num > 9)
        print(num / 10);
    putchar(num % 10 + '0');
}
void bfs(int n, vector<pair<int,int>>& v)
{
    queue<int> q;
    int vis[10] = {0};
    int cnt = 1;
    vis[n] = 1;
    q.push(n);
    while (!q.empty())
    {
        int temp = q.front();
        q.pop();

        for (int i = 0; i < v.size(); i++)
        {
            if (v[i].first == temp && !vis[v[i].second])
            {
                vis[v[i].second] = 1;
                cnt++;
                q.push(v[i].second);
            }
        }
    }

    b[n] = cnt;
}

int main()
{
    string a;
    int k;
    cin >> a >> k;
    vector<pair<int,int> > v(k);
    for (int i = 0; i < k; i++)
    {
        cin >> v[i].first >> v[i].second;
    }
    for (int i = 0; i < 10; i++)
    {
        bfs(i, v);
    }
    __int128 ans = 1;
    for (int i = 0; i < a.size(); i++)
    {
        ans *= b[a[i] - '0'];
    }
    print(ans);
    return 0;
}