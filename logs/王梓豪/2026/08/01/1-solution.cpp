#include <bits/stdc++.h>
using namespace std;
int ans=0;
vector<string> s(21);
vector<int> vis(21,0);
void dfs(string str,int n)
{ans=max(ans,(int)str.size());
for(int i=0;i<n;i++)
{
    if(vis[i]<2)
    {
        for(int j=1;j<min(str.size(),s[i].size());j++)
        {
            if(str.substr(str.size()-j)==s[i].substr(0,j))
            {
                vis[i]++;
                dfs(str+s[i].substr(j),n);
                vis[i]--;
            }
        }
    }
}
}
int main() {
    int n;
    cin>>n;
    for(int i=0;i<n;i++)
    {
        cin>>s[i];
    }
    char ch;
    cin>>ch;
    for(int i=0;i<n;i++)
    {if(s[i][0]==ch)
        {
        vis[i]++;
        dfs(s[i],n);
        vis[i]--;
    }}
    cout<<ans;
}