#include<iostream>
#include<algorithm>
using namespace std;
int a[1000010];
int main()
{
    int n;
    long long m;
    cin>>n>>m;
    int maxi=0;
    for(int i=1;i<=n;i++)
    {
        cin>>a[i];
        maxi=max(maxi,a[i]);
    }
    int l=0,r=maxi;
    int ans=0;
    while(l<=r)
    {
        int mid=(l+r)/2;
        long long sum=0;
        for(int i=1;i<=n;i++){
            if(a[i]>mid)sum+=a[i]-mid;
        }
        if(sum>=m){
            ans=mid;
            l=mid+1;
        }
        else r=mid-1;
    }
    cout<<ans<<endl;
    return 0;
}