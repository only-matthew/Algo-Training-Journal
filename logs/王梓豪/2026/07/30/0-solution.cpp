#include <bits/stdc++.h>
using namespace std;
void print(__int128 x) {
    if(x<0)
    {
        putchar('-');
        x=-x;
    }
    if(x>9)
    {
        print(x/10);
    }
    putchar(x%10+'0');
}
int main() {
    int n,m;
    cin>>m>>n;
    __int128 ans=0;
    while(m--){
    vector<int> v(n);
    for(int i=0;i<n;i++){
        cin>>v[i];
    }
    vector<vector<__int128> > dp(n, vector<__int128>(n, 0));
    for(int i=0;i<n;i++)
    {
        dp[i][i]=(__int128)v[i]*2;
    }
    //dp[i][j]=max(dp[i][j-1]*2+v[j], dp[i+1][j]*2+v[i]);
    for(int i=1;i<n;i++)
    {
        for(int j=i;j<n;j++)
        {
            dp[j-i][j]=max(dp[j-i][j-1]*2+v[j]*2, dp[j-i+1][j]*2+2*v[j-i]);
        }
    }
    ans+=dp[0][n-1];
}
print(ans);
}