#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n,m;
        cin>>n>>m;
        int a[110],b[110];
        for(int i=1;i<=n;i++)cin>>a[i];
        for(int i=1;i<=m;i++)cin>>b[i];
        int t1=a[1]+n-1;
        int t2=b[1]+m-1;
        if(t1>=t2)cout<<1<<endl;
        else cout<<2<<endl;
    }
    return 0;
}