#include<iostream>
using namespace std;
int a[200010];
int pre[200010];
int mx[200010];
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;cin>>n;
        for(int i=1;i<=n;i++)cin>>a[i];
        pre[0]=0;
        for(int i=1;i<=n;i++)
        {
            pre[i]=pre[i-1];
            if(a[i]==1||a[i]==2)pre[i]++;
            else pre[i]--;
        }
        mx[n-1]=pre[n-1];
        for(int i=n-2;i>=1;i--)
        {
            mx[i]=mx[i+1];
            if(pre[i]>mx[i])mx[i]=pre[i];
        }
        int left=0;
        bool flag=false;
        for(int i=1;i<=n-2;i++)
        {
            if(a[i]==1)left++;
            else left--;
            if(left>=0&&mx[i+1]>=pre[i])
            {
                flag=true;
                break;
            }
        }
        if(flag)cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}