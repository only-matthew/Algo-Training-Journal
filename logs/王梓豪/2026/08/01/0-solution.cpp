#include <bits/stdc++.h>
using namespace std;
int ans=0;
void dfs(int last,int cnt,int rest)
{
    if(cnt==1)
    {
        if(rest>=last)
        ans++;
    }
    else if(cnt>1)
    {
        for(int i=last;i<=rest-cnt+1;i++)
        {
            dfs(i,cnt-1,rest-i);
        }
    }
}
int main() {
    int n,k;
    cin>>n>>k;
    dfs(1,k,n);
    cout<<ans;
}