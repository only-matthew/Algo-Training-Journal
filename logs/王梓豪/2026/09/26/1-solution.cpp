#include <bits/stdc++.h>
using namespace std;
 
int main()
{
    ios::sync_with_stdio(0);
    cin.tie(0);
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        cin>>n;
        vector<int> a(n),cnt(101,0);
        for(int i=0;i<n;i++)
        {
            cin>>a[i];
            cnt[a[i]]++;
        }
        bool flag=1;
        while(flag)
        {flag=0;
            for(int i=100;i>=0;i--)
        {
            if(cnt[i]>0){cout<<i<<' ';cnt[i]--;flag=1;}
        }
 
    }
    cout<<endl;
    }
}