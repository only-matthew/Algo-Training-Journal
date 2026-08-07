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
        cin>>n;
        int num[1001]={0};
        long long ans=0;
        for(int i=1;i<=n;i++)
        {
            int x;cin>>x;
            num[x]++;
            ans+=x;
        }
        int maxnum=0,maxnumvalue=0;
        for(int i=1;i<=1000;i++)
        {
            if(num[i]>maxnum)
            {
                maxnum=num[i];maxnumvalue=i;
            }
        }
        int other;other=n-maxnum;
        if(maxnum>other+2)
        {
            int shenyu=maxnum-(other+2);
            ans-=1LL*shenyu*maxnumvalue;
        }
        cout<<ans<<endl;
    }
    return 0;
}