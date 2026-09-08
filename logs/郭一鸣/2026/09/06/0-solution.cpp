#include<iostream>
#include<algorithm>
using namespace std;
long long a[100010];
int main()
{
    int t;cin>>t;
    while(t--)
    {
        int n;cin>>n;
        int num=0;
        for(int i=1;i<=n;i++)
        {
            cin>>a[i];
            if(a[i]==0)num++;
        }
        if(num<=1)cout<<-1<<endl;
        else
        {
            if(a[1]==0&&a[n]==0)cout<<0<<endl;
            else if(a[1]==0&&a[n]!=0)cout<<1<<endl;
            else if(a[1]!=0&&a[n]==0)cout<<1<<endl;
            else cout<<2<<endl;
        }
    }
    return 0;
}