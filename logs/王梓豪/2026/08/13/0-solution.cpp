#include <bits/stdc++.h>
using namespace std;
struct grass
{
    int valume=0;
    int value=0;
};
int main()
{
    int tt,m;
    cin>>tt>>m;
    vector<int> t(m);
    vector<int> v(m);
    for(int i=0;i<m;i++)
    {
    cin>>t[i]>>v[i];
    }
    vector<vector<grass> > dp(m,vector<grass> (tt));
    for(int i=0;i<m;i++)
    {
        for(int j=0;j<tt;j++)
        {
            if(i==0)
            {
                if(j>=t[i]) {dp[i][j].value=v[i];dp[i][j].valume=t[i];}
            }
            else
            {
                    dp[i][j].value=max(dp[i-1][j].value,dp[i-1][j-t[i]].value+t[i]);
                    dp[i][j].valume=dp[i-1][j].value>dp[i-1][j-t[i]].value+v[i]?dp[i-1][j].valume:dp[i-1][j-t[i]].valume+t[i];
            }
        }
    }
    cout<<dp[m-1][tt-1].value;
}