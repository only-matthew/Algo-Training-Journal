#include<iostream>
#include<algorithm>
#include<cmath>
using namespace std;
int a[100010];
int main()
{
    int m,n;
    cin>>m>>n;
    for(int i=1;i<=m;i++)cin>>a[i];
    sort(a+1,a+m+1);
    long long ans=0;
    for(int i=1;i<=n;i++)
    {
        int x;
        cin>>x;
        int l=1,r=m;
        while(l<r)
        {
            int mid=(l+r)/2;
            if(a[mid]>=x)r=mid;
            else l=mid+1;
        }
        if(l==1)ans+=abs(a[l]-x);
        else ans+=min(abs(a[l]-x),abs(a[l-1]-x));
    }
    cout<<ans<<endl;
    return 0;
}