#include<iostream>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;cin>>n;
        int jimin=999999999,oumax=0;
        for(int i=1;i<=n;i++)
        {
            int x;cin>>x;
            if(i%2==1)jimin=min(jimin,x);
            else oumax=max(oumax,x);
        }
        if(n%2==0&&jimin-oumax>=2)cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}