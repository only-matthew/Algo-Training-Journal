#include<iostream>
using namespace std;
int gcd(int a,int b)
{
    if(b==0)return a;
    return gcd(b,a%b);
}
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n,x,y;cin>>n>>x>>y;
        int g=gcd(x,y);
        bool flag=true;
        for(int i=1;i<=n;i++)
        {
            int p;cin>>p;
            if(p%g!=i%g)flag=false;
        }
        if(flag)cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}