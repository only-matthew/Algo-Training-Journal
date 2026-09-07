#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s;
    cin>>s;
    int dp0=0,dp1=0,dp2=0;
    for (char c : s) {
        if (c=='a') {
            dp0++;
            dp2=max(dp2+1,dp1+1);
        } else {
            dp1=max(dp1+1,dp0+1);
        }
    }
    cout<<max({dp0,dp1,dp2})<<'\n';
    return 0;
}