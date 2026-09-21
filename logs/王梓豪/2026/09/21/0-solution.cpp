#include <bits/stdc++.h>
using namespace std;

int main() {
    int t;
    cin>>t;
    while(t--) {
        int n;
        string s;
        cin>>n>>s;
        
        int cnt1=0, cnt0=0;
        int flag=-1;
        
    for(int i=0; i<s.size(); i++) {
            if(s[i]=='0') cnt0++;
            else cnt1++;
            if(flag==-1 && s[i]=='1') flag=i;
        }
        
        if(s[0]=='1') {
            cout<<cnt0<<endl;
            continue;
        }
        
        vector<int> a(n+1, 0);
        for(int i=0; i<n; i++) {
            if(s[i]=='1') a[i+1] = a[i] + 1;
            else a[i+1] = a[i];
        }
        
        int min_ = INT_MAX;
        
        for(int i=0; i<=n; i++) {
            int l1 = a[i];
            int r0 = (n-i) - (a[n]-a[i]);
            int ops = l1 + r0;
            if(flag==-1 && i<n) {
                continue;
            }
            if(flag!=-1 && i>flag && r0>0) {
                if(a[n]-a[i] == 0) {
                    continue;
                }
            }
            min_ = min(min_, ops);
        }
        cout<<min_<<endl;
    }
    return 0;
}