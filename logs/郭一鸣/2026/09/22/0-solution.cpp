#include<iostream>
#include<algorithm>
using namespace std;
int a[200010];
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        cin>>n;
        for(int i=1;i<=n;i++)
        {
            cin>>a[i];
            a[i]-=i;
        }
        sort(a+1,a+n+1);
        int ans=1;
        int cnt=1;
        for(int i=2;i<=n;i++)
        {
            if(a[i]==a[i-1])continue;
            if(a[i]==a[i-1]+1)cnt++;
            else cnt=1;
            ans=max(ans,cnt);
        }
        cout<<ans<<endl;
    }
    return 0;
}