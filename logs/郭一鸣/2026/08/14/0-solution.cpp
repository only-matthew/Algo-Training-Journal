#include<iostream>
#include<algorithm>
using namespace std;
int a[310];
int main()
{
    int n;cin>>n;
    for(int i=1;i<=n;i++)cin>>a[i];
    sort(a+1,a+n+1);
    int l=1,r=n;
    long long ans=0;
    int now=0;
    while(l<=r)
    {
        ans+=(a[r]-now)*(a[r]-now);
        now=a[r];
        r--;
        ans+=(a[l]-now)*(a[l]-now);
        now=a[l];
        l++;
    }
    cout<<ans<<endl;
    return 0;
}