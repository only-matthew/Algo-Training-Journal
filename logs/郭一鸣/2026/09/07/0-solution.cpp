#include<iostream>
#include<algorithm>
using namespace std;
long long a[100010];
int main()
{
    int n,k;
    cin>>n>>k;
    long long mx=0;
    for(int i=1;i<=n;i++)cin>>a[i];
    sort(a+1,a+n+1);
    mx=a[n];
    int l=1,r=mx;
    long long ans=0;
    while(l<=r)
    {
        int mid=(l+r)/2;
        long long sum=0;
        for(int i=1;i<=n;i++)sum+=a[i]/mid;
        if(sum>=k)
        {
            ans=mid;
            l=mid+1;
        }
        else r=mid-1;
    }
    cout<<ans<<endl;
    return 0;
}