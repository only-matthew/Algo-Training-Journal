#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(0);
    cin.tie(0);
    vector<int>zhishu(3e5+10, 0);
    for(int i = 2; i < 3e5+1; i++) {
        if(zhishu[i] == 0) {
            for(int j=2;j*i<3e5+1;j++) {
                zhishu[i*j]=1;
            }
        }
    }
    
    int t;
    cin>>t;
    while(t--) {
        int n,num;
        cin>>n>>num;
        vector<int> a(n);
        for(int i = 0; i < n; i++) {
            cin >> a[i];
        }
        if(num == 1) {
            cout << 0 << endl;
            continue;
        }
        vector<int> g;
        int temp_num = num;
        for(int i = 2; i * i <= temp_num; i++) {
            if(zhishu[i]==0&&temp_num%i==0) {
                g.push_back(i);
                while(temp_num%i==0) {
                    temp_num/=i;
                }
            }
        }
        if(temp_num > 1) {
            g.push_back(temp_num);
        }
        long long maxans = 0;
        for(int j = 0; j < g.size(); j++) {
            long long temp = 0;
            for(int i = 0; i < n; i++) {
                if(a[i] % g[j] == 0) {
                    temp += a[i];
                }
            }
            maxans = max(temp, maxans);
        }
        
        cout<<maxans<<endl;
    }
}