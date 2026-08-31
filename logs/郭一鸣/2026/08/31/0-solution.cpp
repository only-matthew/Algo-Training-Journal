#include<iostream>
using namespace std;
long long a[100010];
int main()
{
    int n;
    long long x;
    cin>>n>>x;
    for(int i=1;i<=n;i++)cin>>a[i];
    long long ans=0;
    for(int i=1;i<=n;i++)
    {
        if(a[i-1]+a[i]>x)
        {
            long long t=a[i-1]+a[i]-x;
            ans+=t;
            a[i]-=t;
        }
    }
    cout<<ans<<endl;
    return 0;
}