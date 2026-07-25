#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        cin>>n;
        long long sum=0;
        bool flag=true;
        for(long long i=1;i<=n;i++)
        {
            long long a;
            cin>>a;
            sum+=a;
            if(sum<i*(i+1)/2)flag=false;
        }
        if(flag)cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}