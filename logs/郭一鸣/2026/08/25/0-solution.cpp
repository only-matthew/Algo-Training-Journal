#include<iostream>
using namespace std;
int a[100010];
int main()
{
    int n;cin>>n;
    for(int i=1;i<=n;i++)cin>>a[i];
    int ans=a[1];
    for(int i=2;i<=n;i++)
    {
        if(a[i]>a[i-1])
        {
            ans+=a[i]-a[i-1];
        }
    }
    cout<<ans<<endl;
    return 0;
}