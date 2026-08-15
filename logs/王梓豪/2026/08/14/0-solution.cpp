#include <bits/stdc++.h>
using namespace std;
int main()
{
    int n,w;
    cin>>n>>w;
    vector<int> a(n);
    for(int i=0;i<n;i++)
    {
        cin>>a[i];
    }
    for(int i=1;i<n;i++)
    {
        a[i]=a[i-1]+a[i];
    }
    int max_=INT_MIN,min_=INT_MAX;
    for(int i=0;i<n;i++)
    {
        max_=max(max_,a[i]);
        min_=min(min_,a[i]);
    }int ans;
    min_=min(0,min_);max_=max(max_,0);
    ans=w-(max_-min_);

if(ans<0)cout<<0;
else cout<<ans+1;

}