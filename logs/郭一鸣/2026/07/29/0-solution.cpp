#include<iostream>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        long long c;
        cin>>n>>c;
        long long a[200010];
        long long ans=0;
        for(int i=1;i<=n;i++)
        {
            cin>>a[i];
            ans+=a[i]-c;
        }
        sort(a+1,a+n+1);
        for(int i=1;i<=n/2;i++)
        {
            if(a[i]<c)
            {
                ans+=c-a[i];
            }
        }
        cout<<ans<<endl;
    }
    return 0;
}