#include <bits/stdc++.h>
using namespace std;
int main()
{
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n,p0;
    cin>>n>>p0;
    vector<int> p(n + 1);
    for (int i = 1; i < n; i++) {
        cin >> p[i];
    }
    queue<int> q;
    vector<int> if_v(n+1,INT_MAX);
    if_v[0]=0;
    for(int k=1;k<=p0;k++)
    {
        if_v[k]=1;
        q.push(k);
    }
        while(!q.empty())
        {
            int temp=q.front();
            if(temp==n)break;
            q.pop();
            if(temp+p[temp]<=n&&if_v[temp+p[temp]]==INT_MAX){if_v[temp+p[temp]]=if_v[temp]+1;q.push(temp+p[temp]);}
            if(temp-p[temp]>0&&if_v[temp-p[temp]]==INT_MAX){if_v[temp-p[temp]]=if_v[temp]+1;q.push(temp-p[temp]);}
        }
    if(if_v[n]!=INT_MAX)cout<<if_v[n];
else cout<<-1;
}